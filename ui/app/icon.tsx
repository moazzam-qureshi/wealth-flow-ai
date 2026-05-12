import { ImageResponse } from "next/og";

// Generated PWA / favicon icon — a mint marker on the near-black console surface.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0b0d",
          borderRadius: 96,
        }}
      >
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 44,
            background: "linear-gradient(160deg, #4fe3b0, #2ba37e)",
            boxShadow: "0 0 80px rgba(79,227,176,0.5)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
