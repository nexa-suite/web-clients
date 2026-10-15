import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  canAccessPlatformFeature,
  PLATFORM_ACCESS_RULES,
} from "../../../core/platform-access-policy";
import { FormsModule } from "@angular/forms";
import { Observable, firstValueFrom } from "rxjs";
import { NexaButton, NexaSurface } from "nexa-ui";
import {
  NexaApiError,
  NexaPlatformClientAccountsApi,
  type BuyerMembershipCandidate,
  type ClientAccountDetail,
  type ClientAccountPage,
  type ClientAddress,
  type CreateClientAccount,
  type DeliveryAddressInput,
  NexaPeruGeographyApi,
  type PeruGeographyOption,
  type UpdateClientAccount,
} from "@nexa/api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

const blankClient = (): CreateClientAccount => ({
  code: "",
  businessName: "",
  commercialName: "",
  countryCode: "PE",
  taxType: "RUC",
  taxValue: "",
  segment: "",
  contactPerson: "",
  contactEmail: "",
  phone: "",
  deliveryProfile: "",
  paymentCondition: "",
});
const blankAddress = (): DeliveryAddressInput => ({
  addressType: null,
  roadType: null,
  streetName: null,
  streetNumber: null,
  interior: null,
  postalCode: null,
  placeId: null,
  source: null,
  line: "",
  reference: "",
  countryCode: "PE",
  departmentCode: "",
  provinceCode: "",
  districtCode: "",
  latitude: null,
  longitude: null,
  recipientName: "",
  recipientPhone: "",
  receivingInstructions: "",
  receivingHours: "",
});

const blankEdit = (): UpdateClientAccount => ({
  businessName: "",
  commercialName: "",
  contactPerson: "",
  contactEmail: "",
  phone: "",
  deliveryProfile: "",
  paymentCondition: "",
});

@Component({
  selector: "platform-clients-page",
  standalone: true,
  imports: [FormsModule, RouterLink, NexaButton, NexaSurface],
  templateUrl: "./platform-clients-page.component.html",
  styleUrl: "./platform-clients-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformClientsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(NexaPlatformClientAccountsApi);
  private readonly geography = inject(NexaPeruGeographyApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private geographyRequestVersion = 0;
  private activeLease: ReturnType<PlatformSessionStore["captureSessionLease"]> =
    null;
  constructor() {
    effect(() => {
      const state = this.sessions.state();
      if (
        state.status !== "authenticated" ||
        (this.activeLease &&
          !this.sessions.isSessionLeaseCurrent(this.activeLease))
      ) {
        this.page.set(null);
        this.selected.set(null);
        this.addresses.set([]);
        this.clearGeography();
        this.candidates.set([]);
        this.draft = blankClient();
        this.search = "";
        this.busy.set(false);
        this.edit = blankEdit();
        this.resetAddress();
        this.buyerMembershipId = "";
        this.notice.set("");
        this.error.set("");
      }
    });
  }
  readonly page = signal<ClientAccountPage | null>(null);
  readonly selected = signal<ClientAccountDetail | null>(null);
  readonly addresses = signal<ClientAddress[]>([]);
  readonly departments = signal<readonly PeruGeographyOption[]>([]);
  readonly provinces = signal<readonly PeruGeographyOption[]>([]);
  readonly districts = signal<readonly PeruGeographyOption[]>([]);
  readonly roadTypes = signal<readonly PeruGeographyOption[]>([]);
  readonly departmentsLoading = signal(false);
  readonly provincesLoading = signal(false);
  readonly districtsLoading = signal(false);
  readonly roadTypesLoading = signal(false);
  readonly geographyError = signal("");
  readonly candidates = signal<BuyerMembershipCandidate[]>([]);
  readonly busy = signal(false);
  readonly error = signal("");
  readonly notice = signal("");
  search = "";
  draft: CreateClientAccount = blankClient();
  edit = blankEdit();
  address = blankAddress();
  addressLabel = "";
  addressDefault = false;
  editingAddressId: string | null = null;
  buyerMembershipId = "";

  get canManage(): boolean {
    return this.permission("client.manage");
  }
  get canManageAddresses(): boolean {
    return this.permission("client.address.manage");
  }
  get canViewOrders(): boolean {
    const state = this.sessions.state();
    return (
      state.status === "authenticated" &&
      canAccessPlatformFeature(state.session, PLATFORM_ACCESS_RULES.salesOrders)
    );
  }
  get canViewRequests(): boolean {
    const state = this.sessions.state();
    return (
      state.status === "authenticated" &&
      canAccessPlatformFeature(
        state.session,
        PLATFORM_ACCESS_RULES.purchaseRequests,
      )
    );
  }
  ngOnInit(): void {
    void this.load().then(() => {
      const id = this.route.snapshot.queryParamMap.get("clientId");
      if (id) void this.select(id);
    });
  }

  async load(page = 0): Promise<void> {
    await this.run(async () => {
      const result = await this.request(
        this.api.list(this.search.trim(), page),
      );
      this.page.set(result);
      this.selected.set(null);
      this.addresses.set([]);
      this.clearGeography();
      this.resetAddress();
    });
  }
  async select(id: string): Promise<void> {
    this.clearGeography();
    await this.run(async () => {
      const [client, addresses] = await Promise.all([
        this.request(this.api.detail(id)),
        this.request(this.api.addresses(id)),
      ]);
      this.selected.set(client);
      this.addresses.set(addresses);
      this.edit = this.editFrom(client);
      this.resetAddress();
      this.candidates.set([]);
      this.buyerMembershipId = "";
      const requestVersion = ++this.geographyRequestVersion;
      const lease = this.activeLease;
      if (!lease) return;
      this.departmentsLoading.set(true);
      this.roadTypesLoading.set(true);
      try {
        const [departments, roadTypes] = await Promise.all([
          this.request(this.geography.departments()),
          this.request(this.geography.roadTypes()),
        ]);
        if (this.isGeographyRequestCurrent(requestVersion, lease)) {
          this.departments.set(departments);
          this.roadTypes.set(roadTypes.filter((option) => option.active));
        }
      } catch {
        if (this.isGeographyRequestCurrent(requestVersion, lease))
          this.geographyError.set(
            "Location options could not be loaded. Refresh before changing address geography.",
          );
      } finally {
        if (this.isGeographyRequestCurrent(requestVersion, lease))
          this.departmentsLoading.set(false);
        if (this.isGeographyRequestCurrent(requestVersion, lease))
          this.roadTypesLoading.set(false);
      }
    });
  }
  async create(): Promise<void> {
    if (!this.canManage) return;
    await this.run(async () => {
      const client = await this.request(this.api.create(this.draft));
      this.draft = blankClient();
      await this.reloadSelected(client.id);
      this.notice.set("Client account created.");
    });
  }
  async save(): Promise<void> {
    const client = this.selected();
    if (!client || !this.canManage) return;
    await this.run(async () => {
      await this.request(this.api.update(client.id, client.version, this.edit));
      await this.reloadSelected(client.id);
      this.notice.set("Client account updated.");
    });
  }
  async status(action: "activations" | "suspensions"): Promise<void> {
    const client = this.selected();
    if (!client || !this.canManage) return;
    await this.run(async () => {
      await this.request(
        this.api.changeStatus(client.id, client.version, action),
      );
      await this.reloadSelected(client.id);
      this.notice.set("Client status updated.");
    });
  }
  async loadCandidates(): Promise<void> {
    if (!this.canManage) return;
    await this.run(async () => {
      this.candidates.set(await this.request(this.api.buyerCandidates()));
    });
  }
  async associateBuyer(): Promise<void> {
    const client = this.selected();
    if (!client || !this.canManage || !this.buyerMembershipId) return;
    await this.run(async () => {
      await this.request(
        this.api.associateBuyer(
          client.id,
          client.version,
          this.buyerMembershipId,
        ),
      );
      await this.reloadSelected(client.id);
      this.candidates.set([]);
      this.notice.set("Buyer membership linked.");
    });
  }
  editAddress(value: ClientAddress): void {
    this.editingAddressId = value.id;
    this.addressLabel = value.label;
    this.address = {
      addressType: value.addressType,
      roadType: value.roadType,
      streetName: value.streetName,
      streetNumber: value.streetNumber,
      interior: value.interior,
      postalCode: value.postalCode,
      latitude: value.latitude,
      longitude: value.longitude,
      placeId: value.placeId,
      source: value.source,
      line: value.line,
      reference: value.reference,
      countryCode: value.countryCode,
      departmentCode: value.departmentCode,
      provinceCode: value.provinceCode,
      districtCode: value.districtCode,
      recipientName: value.recipientName,
      recipientPhone: value.recipientPhone,
      receivingInstructions: value.receivingInstructions,
      receivingHours: value.receivingHours,
    };
    void this.loadAddressGeography(value.departmentCode, value.provinceCode);
  }
  resetAddress(): void {
    this.geographyRequestVersion += 1;
    this.editingAddressId = null;
    this.addressLabel = "";
    this.address = blankAddress();
    this.addressDefault = false;
    this.provinces.set([]);
    this.districts.set([]);
    this.provincesLoading.set(false);
    this.districtsLoading.set(false);
    this.geographyError.set("");
  }
  protected async selectDepartment(code: string): Promise<void> {
    this.address = {
      ...this.address,
      departmentCode: code,
      provinceCode: "",
      districtCode: "",
    };
    this.provinces.set([]);
    this.districts.set([]);
    this.provincesLoading.set(false);
    this.geographyError.set("");
    const requestVersion = ++this.geographyRequestVersion;
    const lease = this.activeLease;
    if (!code || !lease) return;
    this.provincesLoading.set(true);
    try {
      const provinces = await this.request(this.geography.provinces(code));
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.provinces.set(provinces);
    } catch {
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.geographyError.set(
          "Provinces could not be loaded for this department.",
        );
    } finally {
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.provincesLoading.set(false);
    }
  }
  protected async selectProvince(code: string): Promise<void> {
    this.address = {
      ...this.address,
      provinceCode: code,
      districtCode: "",
    };
    this.districts.set([]);
    this.districtsLoading.set(false);
    this.geographyError.set("");
    const requestVersion = ++this.geographyRequestVersion;
    const lease = this.activeLease;
    if (!code || !lease) return;
    this.districtsLoading.set(true);
    try {
      const districts = await this.request(this.geography.districts(code));
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.districts.set(districts);
    } catch {
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.geographyError.set(
          "Districts could not be loaded for this province.",
        );
    } finally {
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.districtsLoading.set(false);
    }
  }
  async saveAddress(): Promise<void> {
    const client = this.selected();
    if (!client || !this.canManageAddresses) return;
    if (!this.coordinatesValid()) {
      this.error.set(
        "Enter both latitude and longitude, within -90 to 90 and -180 to 180.",
      );
      return;
    }
    await this.run(async () => {
      const existing = this.addresses().find(
        (item) => item.id === this.editingAddressId,
      );
      if (existing)
        await this.request(
          this.api.updateAddress(
            client.id,
            existing.id,
            existing.version,
            this.addressLabel,
            this.address,
          ),
        );
      else
        await this.request(
          this.api.createAddress(
            client.id,
            this.addressLabel,
            this.address,
            this.addressDefault,
          ),
        );
      this.addresses.set(await this.request(this.api.addresses(client.id)));
      this.resetAddress();
      this.notice.set("Delivery address saved.");
    });
  }
  async changeAddress(
    value: ClientAddress,
    action: "default" | "deactivate",
  ): Promise<void> {
    const client = this.selected();
    if (!client || !this.canManageAddresses) return;
    await this.run(async () => {
      if (action === "default")
        await this.request(
          this.api.setDefaultAddress(client.id, value.id, value.version),
        );
      else
        await this.request(
          this.api.deactivateAddress(client.id, value.id, value.version),
        );
      this.addresses.set(await this.request(this.api.addresses(client.id)));
      this.notice.set("Delivery address updated.");
    });
  }
  private async reloadSelected(id: string): Promise<void> {
    const [client, addresses, page] = await Promise.all([
      this.request(this.api.detail(id)),
      this.request(this.api.addresses(id)),
      this.request(this.api.list(this.search.trim(), this.page()?.page ?? 0)),
    ]);
    this.selected.set(client);
    this.edit = this.editFrom(client);
    this.addresses.set(addresses);
    this.page.set(page);
  }
  private editFrom(client: ClientAccountDetail): UpdateClientAccount {
    return {
      businessName: client.businessName,
      commercialName: client.commercialName,
      contactPerson: client.contactPerson,
      contactEmail: client.contactEmail,
      phone: client.phone,
      deliveryProfile: client.deliveryProfile,
      paymentCondition: client.paymentCondition,
    };
  }
  protected coordinatesValid(): boolean {
    const { latitude, longitude } = this.address;
    if (latitude == null && longitude == null) return true;
    return (
      typeof latitude === "number" &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      typeof longitude === "number" &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180
    );
  }
  protected hasGeographyOption(
    options: readonly PeruGeographyOption[],
    code: string,
  ): boolean {
    return options.some((option) => option.code === code);
  }
  private async loadAddressGeography(
    departmentCode: string,
    provinceCode: string,
  ): Promise<void> {
    const requestVersion = ++this.geographyRequestVersion;
    this.provinces.set([]);
    this.districts.set([]);
    this.provincesLoading.set(false);
    this.districtsLoading.set(false);
    this.geographyError.set("");
    const lease = this.activeLease;
    if (!departmentCode || !lease) return;
    this.provincesLoading.set(true);
    try {
      const provinces = await this.request(
        this.geography.provinces(departmentCode),
      );
      if (!this.isGeographyRequestCurrent(requestVersion, lease)) return;
      this.provinces.set(provinces);
      if (!provinceCode) return;
      this.districtsLoading.set(true);
      if (!this.isGeographyRequestCurrent(requestVersion, lease)) return;
      const districts = await this.request(
        this.geography.districts(provinceCode),
      );
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.districts.set(districts);
    } catch {
      if (this.isGeographyRequestCurrent(requestVersion, lease))
        this.geographyError.set(
          "Saved address geography could not be fully loaded. Existing values are preserved.",
        );
    } finally {
      if (this.isGeographyRequestCurrent(requestVersion, lease)) {
        this.provincesLoading.set(false);
        this.districtsLoading.set(false);
      }
    }
  }
  private clearGeography(): void {
    this.geographyRequestVersion += 1;
    this.departments.set([]);
    this.roadTypes.set([]);
    this.provinces.set([]);
    this.districts.set([]);
    this.departmentsLoading.set(false);
    this.roadTypesLoading.set(false);
    this.provincesLoading.set(false);
    this.districtsLoading.set(false);
    this.geographyError.set("");
  }
  private isGeographyRequestCurrent(
    requestVersion: number,
    lease: ReturnType<PlatformSessionStore["captureSessionLease"]>,
  ): boolean {
    return (
      requestVersion === this.geographyRequestVersion &&
      lease !== null &&
      !this.destroyRef.destroyed &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }
  private permission(code: string): boolean {
    const state = this.sessions.state();
    return (
      state.status === "authenticated" &&
      state.session.membership?.permissions?.includes(code) === true
    );
  }
  private async request<T>(request: Observable<T>): Promise<T> {
    const lease = this.activeLease;
    if (
      !lease ||
      this.destroyRef.destroyed ||
      !this.sessions.isSessionLeaseCurrent(lease)
    )
      throw new Error("Session changed");
    const value = await firstValueFrom(request);
    if (
      this.destroyRef.destroyed ||
      !this.sessions.isSessionLeaseCurrent(lease)
    )
      throw new Error("Session changed");
    return value;
  }
  private async run(action: () => Promise<void>): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease || this.busy()) return;
    this.activeLease = lease;
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      await action();
    } catch (error: unknown) {
      if (
        !this.destroyRef.destroyed &&
        this.sessions.isSessionLeaseCurrent(lease)
      ) {
        this.error.set(
          error instanceof NexaApiError &&
            (error.kind === "conflict" || error.kind === "precondition")
            ? "Data changed or conflicts with an existing record. Reopen the client to refresh its version before retrying."
            : error instanceof NexaApiError && error.kind === "validation"
              ? "Check the required fields and formats, then try again."
              : error instanceof NexaApiError && error.kind === "forbidden"
                ? "Your current membership cannot perform this action."
                : "Request could not be completed. Refresh current data before retrying a change.",
        );
      }
    } finally {
      if (this.sessions.isSessionLeaseCurrent(lease)) this.busy.set(false);
    }
  }
}
