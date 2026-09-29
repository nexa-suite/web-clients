#!/bin/sh
set -eu

api_base_url=${NEXA_PLATFORM_API_BASE_URL:-}
if [ -z "$api_base_url" ]; then
    exit 0
fi

while [ "${api_base_url%/}" != "$api_base_url" ]; do
    api_base_url=${api_base_url%/}
done

case "$api_base_url" in
    *[!A-Za-z0-9.:/_\[\]-]*)
        printf '%s\n' 'NEXA_PLATFORM_API_BASE_URL contains unsupported characters.' >&2
        exit 1
        ;;
esac

case "$api_base_url" in
    /api/v1)
        ;;
    http://*|https://*)
        scheme=${api_base_url%%://*}
        case "$api_base_url" in
            */api/v1) origin=${api_base_url%/api/v1} ;;
            *)
                printf '%s\n' 'NEXA_PLATFORM_API_BASE_URL must use the /api/v1 path.' >&2
                exit 1
                ;;
        esac
        authority=${origin#*://}
        if ! printf '%s\n%s\n' "$scheme" "$authority" | awk '
            function valid_port(port) {
                return port ~ /^[0-9]+$/ && port + 0 >= 1 && port + 0 <= 65535
            }
            function valid_ipv4(host, octets, count, i) {
                count = split(host, octets, ".")
                if (count != 4) return 0
                for (i = 1; i <= count; i++) {
                    if (octets[i] !~ /^[0-9]+$/ || octets[i] + 0 > 255) return 0
                }
                return 1
            }
            NR == 1 { scheme = $0; next }
            {
                if (scheme != "http" && scheme != "https") exit 1
                if ($0 ~ /^\[::1\](:[0-9]+)?$/) {
                    host = "::1"
                    if ($0 ~ /\]:/) {
                        port = $0
                        sub(/^.*\]:/, "", port)
                        if (!valid_port(port)) exit 1
                    }
                    loopback = 1
                } else if ($0 ~ /^[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?$/) {
                    host = $0
                    if (index(host, ":")) {
                        split(host, parts, ":")
                        host = parts[1]
                        if (!valid_port(parts[2])) exit 1
                    }
                    if (host ~ /^[0-9.]+$/ && !valid_ipv4(host)) exit 1
                    loopback = tolower(host) == "localhost" || host == "127.0.0.1"
                } else {
                    exit 1
                }
                if (scheme == "http" && !loopback) exit 1
            }
        '; then
            printf '%s\n' 'Absolute Platform API origins require a valid port and HTTPS, except for loopback development hosts.' >&2
            exit 1
        fi
        ;;
    *)
        printf '%s\n' 'NEXA_PLATFORM_API_BASE_URL must be /api/v1 or an HTTP(S) URL ending in /api/v1.' >&2
        exit 1
        ;;
esac

temporary_config=$(mktemp /usr/share/nginx/html/runtime-config.XXXXXX)
trap 'rm -f "$temporary_config"' EXIT HUP INT TERM
printf 'window.__NEXA_PLATFORM_CONFIG__ = { apiBaseUrl: "%s" };\n' "$api_base_url" > "$temporary_config"
chmod 0644 "$temporary_config"
mv "$temporary_config" /usr/share/nginx/html/runtime-config.js
