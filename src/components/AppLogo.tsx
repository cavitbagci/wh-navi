export default function AppLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Dış daire - koyu mavi arka plan */}
      <circle cx="18" cy="18" r="18" fill="#1d4ed8" />

      {/* Radar halkaları */}
      <circle cx="18" cy="18" r="13" stroke="#60a5fa" strokeWidth="1" opacity="0.35" />
      <circle cx="18" cy="18" r="8" stroke="#60a5fa" strokeWidth="1" opacity="0.35" />

      {/* Kuzey (beyaz) yarısı - navigasyon oku */}
      <path d="M18 7 L22.5 23 L18 20.5 L13.5 23 Z" fill="white" />

      {/* Güney (açık mavi) yarısı */}
      <path d="M18 29 L13.5 23 L18 20.5 L22.5 23 Z" fill="#93c5fd" />

      {/* Merkez nokta */}
      <circle cx="18" cy="20.5" r="1.5" fill="#1d4ed8" />
    </svg>
  );
}