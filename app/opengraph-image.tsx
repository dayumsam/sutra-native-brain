import { ImageResponse } from "next/og";

export const alt = "Sutra — Manufacturing Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          background: "#1d1b2e",
        }}
      >
        <svg viewBox="0 0 1024 1024" width="180" height="180">
          <path
            fill="#FFFFFF"
            d="M 718.538 408.526 C 719.983 409.551 721.401 410.613 722.793 411.709 C 747.889 431.066 764.207 459.651 768.117 491.102 C 775.523 552.551 745.926 578.078 706.222 617.217 L 642.424 679.941 L 568.027 752.94 C 554.541 765.94 537.458 783.89 522.041 793.879 C 465.85 830.283 397.938 822.835 346.408 781.852 C 293.775 736.305 282.044 670.612 311.021 608.237 C 312.279 609.292 313.545 610.337 314.818 611.374 C 349.07 639.233 386.958 650.871 430.914 646.239 C 484.307 640.614 510.86 612.229 546.84 577.091 L 607.574 517.898 L 673.525 454.24 C 687.676 440.631 706.524 423.431 718.538 408.526 z"
          />
          <path
            fill="#FFFFFF"
            d="M 585.065 211.408 C 608.18 209.046 640.629 216.178 661.426 226.191 C 694.329 241.632 719.677 269.609 731.806 303.872 C 744.78 341.477 736.682 368.993 720.16 402.679 C 684.611 369.318 656.672 351.809 606.825 348.756 C 532.158 344.182 499.258 386.12 449.8 432.486 L 374.607 502.862 C 344.27 531.039 318.769 559.062 312.34 602.383 C 287.176 579.954 270.554 558.788 266.675 524.211 C 260.431 468.542 296.21 437.733 332.653 403.22 L 397.157 342.396 L 466.945 276.441 C 506.528 239.099 526.98 216.743 585.065 211.408 z"
          />
        </svg>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: "#f4f3fb", letterSpacing: -2 }}>
            Sutra
          </div>
          <div style={{ fontSize: 32, fontWeight: 400, color: "#8f8bb0" }}>
            Manufacturing Intelligence
          </div>
        </div>
      </div>
    ),
    size
  );
}
