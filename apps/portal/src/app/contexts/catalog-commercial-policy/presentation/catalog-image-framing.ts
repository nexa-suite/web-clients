export interface CatalogImageFraming {
  readonly aspectRatio: string;
  readonly aspectValue: number;
  readonly maxWidthPx: number;
  readonly mode: "cover" | "crop" | "contain";
  readonly imageWidthPercent?: number;
  readonly imageLeftPercent?: number;
  readonly imageTopPercent?: number;
}

interface AspectRatioFraming {
  readonly aspectRatio: string;
}

interface AlphaBounds {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

// These local PNGs were measured by alpha bounds. Each frame keeps at least
// 2% transparent clearance on the cropped axis; unknown files stay contained.
const TRANSPARENT_IMAGE_FRAMING: Readonly<Record<string, AspectRatioFraming>> =
  {
    "cavour-salame-milano-molde-2-5kg.png": { aspectRatio: "1.45 / 1" },
    "cavour-salame-napoli-molde-1-5kg.png": { aspectRatio: "1.1 / 1" },
    "gestam-queso-edam-bola-corte.png": { aspectRatio: "1.45 / 1" },
    "gestam-queso-edam-bola-molde-1-9kg.png": { aspectRatio: "1.4 / 1" },
    "gestam-queso-gouda-cabra-molde-5kg.png": { aspectRatio: "1.35 / 1" },
    "gestam-queso-gouda-chili-corte.png": { aspectRatio: "1.25 / 1" },
    "gestam-queso-gouda-chili-molde-4-5kg.png": { aspectRatio: "1.45 / 1" },
    "gestam-queso-gouda-comino-corte.png": { aspectRatio: "1.35 / 1" },
    "gestam-queso-gouda-comino-molde-4-5kg.png": { aspectRatio: "1.3 / 1" },
    "gestam-queso-gouda-finas-hierbas-molde-4-5kg.png": {
      aspectRatio: "1.4 / 1",
    },
    "gestam-queso-gouda-natural-corte.png": { aspectRatio: "1.2 / 1" },
    "gestam-queso-gouda-natural-molde-4-5kg.png": { aspectRatio: "1.4 / 1" },
    "gestam-queso-gouda-pimienta-molde-4-5kg.png": { aspectRatio: "1.35 / 1" },
    "gestam-queso-maasdam-corte.png": { aspectRatio: "1.45 / 1" },
    "gestam-queso-maasdam-molde-12-5kg.png": { aspectRatio: "1.45 / 1" },
    "green-island-queso-danish-blue-molde-3kg.png": { aspectRatio: "1.15 / 1" },
    "happy-cow-queso-slices-cheddar-48u-800g.png": { aspectRatio: "1.45 / 1" },
    "le-fromelier-queso-feta-dop-corte.png": { aspectRatio: "1.45 / 1" },
    "paysan-breton-mantequilla-con-sal-20x10g.png": { aspectRatio: "1.15 / 1" },
    "paysan-breton-mantequilla-sin-sal-20x10g.png": { aspectRatio: "1.1 / 1" },
    "paysan-breton-queso-bleu-dauvergne-125g.png": { aspectRatio: "1.3 / 1" },
    "paysan-breton-queso-de-cabra-afh-100g.png": { aspectRatio: "1.4 / 1" },
    "paysan-breton-queso-de-cabra-miel-100g.png": { aspectRatio: "1.45 / 1" },
    "paysan-breton-queso-de-cabra-natural-100g.png": {
      aspectRatio: "1.45 / 1",
    },
    "paysan-breton-queso-de-cabra-pimienta-100g.png": {
      aspectRatio: "1.45 / 1",
    },
    "paysan-breton-queso-emmental-corte.png": { aspectRatio: "1.2 / 1" },
    "paysan-breton-queso-emmental-molde-3-5kg.png": { aspectRatio: "1.45 / 1" },
    "paysan-breton-queso-petit-moule-afh-150g.png": { aspectRatio: "1.4 / 1" },
    "paysan-breton-raclette-slices-400g.png": { aspectRatio: "1.2 / 1" },
    "sancho-panza-queso-manchego-dop-12-meses-corte.png": {
      aspectRatio: "1.4 / 1",
    },
    "sancho-panza-queso-manchego-dop-3-meses-corte.png": {
      aspectRatio: "1.45 / 1",
    },
    "sancho-panza-queso-manchego-dop-6-meses-corte.png": {
      aspectRatio: "1.45 / 1",
    },
    "sterilgarda-pannacotta-caramel-2x90g.png": { aspectRatio: "1.45 / 1" },
    "sterilgarda-queso-mascarpone-uht-500g.png": { aspectRatio: "1.4 / 1" },
  };

// A smaller set needs a per-image crop window because a centered cover crop
// would remove visible package pixels. Bounds are (left, top, right, bottom).
const ALPHA_BOUNDS: Readonly<Record<string, AlphaBounds>> = {
  "agriform-queso-grana-padano-dop-150g.png": {
    width: 1280,
    height: 1280,
    left: 384,
    top: 59,
    right: 908,
    bottom: 1203,
  },
  "agriform-queso-parmigiano-reggiano-dop-150g.png": {
    width: 1280,
    height: 1280,
    left: 364,
    top: 72,
    right: 908,
    bottom: 1203,
  },
  "cavour-coppa-molde-3kg.png": {
    width: 433,
    height: 577,
    left: 138,
    top: 0,
    right: 301,
    bottom: 566,
  },
  "cavour-mortadella-bologna-igp-con-pistacchio-molde-7-5kg.png": {
    width: 1280,
    height: 960,
    left: 0,
    top: 0,
    right: 1280,
    bottom: 899,
  },
  "gestam-queso-ahumado-jamon-molde-3kg.png": {
    width: 1377,
    height: 1600,
    left: 475,
    top: 124,
    right: 932,
    bottom: 1451,
  },
  "gestam-queso-ahumado-natural-molde-3kg.png": {
    width: 1543,
    height: 1599,
    left: 98,
    top: 149,
    right: 1342,
    bottom: 1513,
  },
  "gestam-queso-ahumado-picante-molde-3kg.png": {
    width: 1338,
    height: 1600,
    left: 443,
    top: 171,
    right: 986,
    bottom: 1442,
  },
  "green-island-queso-danish-blue-100g.png": {
    width: 901,
    height: 957,
    left: 96,
    top: 55,
    right: 828,
    bottom: 894,
  },
  "le-charcutier-prosciutto-crudo-premium-mattonella-molde-4kg.png": {
    width: 610,
    height: 601,
    left: 8,
    top: 8,
    right: 607,
    bottom: 598,
  },
};

// Opaque images retain every source pixel; their frames follow native ratios.
const NATIVE_IMAGE_DIMENSIONS: Readonly<
  Record<string, readonly [number, number]>
> = {
  "cavour-salame-milano-100g.jpeg": [1280, 1280],
  "cavour-salame-napoli-100g.jpeg": [1280, 1280],
  "gestam-queso-gouda-cabra-corte.jpeg": [782, 781],
  "gestam-queso-gouda-finas-hierbas-corte.jpeg": [1250, 1247],
  "gestam-queso-gouda-pimienta-corte.jpeg": [883, 885],
  "sancho-panza-queso-manchego-dop-3-meses-molde-3kg.png": [1254, 1254],
  "sancho-panza-queso-manchego-dop-6-meses-molde-3kg.png": [1254, 1254],
};

const TRANSPARENT_CROP_PADDING = 0.02;
const MIN_FRAME_ASPECT_RATIO = 0.75;
const MAX_FRAME_HEIGHT_PX = 360;

function createFraming(
  aspectValue: number,
  mode: CatalogImageFraming["mode"],
  crop?: {
    readonly width: number;
    readonly left: number;
    readonly top: number;
  },
): CatalogImageFraming {
  return {
    aspectRatio: `${aspectValue.toFixed(4)} / 1`,
    aspectValue,
    maxWidthPx: aspectValue * MAX_FRAME_HEIGHT_PX,
    mode,
    ...(crop
      ? {
          imageWidthPercent: crop.width,
          imageLeftPercent: crop.left,
          imageTopPercent: crop.top,
        }
      : {}),
  };
}

function createAlphaFraming(bounds: AlphaBounds): CatalogImageFraming {
  const paddingX = bounds.width * TRANSPARENT_CROP_PADDING;
  const paddingY = bounds.height * TRANSPARENT_CROP_PADDING;
  const cropLeft = Math.max(0, bounds.left - paddingX);
  const cropTop = Math.max(0, bounds.top - paddingY);
  const cropRight = Math.min(bounds.width, bounds.right + paddingX);
  const cropBottom = Math.min(bounds.height, bounds.bottom + paddingY);
  const cropWidth = cropRight - cropLeft;
  const cropHeight = cropBottom - cropTop;
  const cropAspectRatio = cropWidth / cropHeight;
  const frameAspectRatio = Math.max(cropAspectRatio, MIN_FRAME_ASPECT_RATIO);
  const cropViewportWidth = cropAspectRatio / frameAspectRatio;

  return createFraming(frameAspectRatio, "crop", {
    width: (100 / (cropWidth / bounds.width)) * cropViewportWidth,
    left:
      ((1 - cropViewportWidth) / 2 -
        cropViewportWidth * (cropLeft / cropWidth)) *
      100,
    top: -(cropTop / cropHeight) * 100,
  });
}

export function catalogImageFraming(
  fileName: string | null | undefined,
): CatalogImageFraming | null {
  if (!fileName) return null;
  const safeCover = TRANSPARENT_IMAGE_FRAMING[fileName];
  if (safeCover) {
    const aspectValue = Number(safeCover.aspectRatio.split("/")[0].trim());
    return createFraming(aspectValue, "cover");
  }

  const alphaBounds = ALPHA_BOUNDS[fileName];
  if (alphaBounds) return createAlphaFraming(alphaBounds);

  const nativeDimensions = NATIVE_IMAGE_DIMENSIONS[fileName];
  if (nativeDimensions) {
    const [width, height] = nativeDimensions;
    return createFraming(
      Math.max(width / height, MIN_FRAME_ASPECT_RATIO),
      "contain",
    );
  }

  return null;
}
