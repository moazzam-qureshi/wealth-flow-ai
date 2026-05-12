import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: 22,
            background: "linear-gradient(160deg, #4fe3b0, #2ba37e)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
