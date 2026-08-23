import type { SVGProps } from "react";

/**
 * Sidebar iconography. One consistent set: 16px grid, 1.5 stroke, round caps,
 * no fills — so nothing competes with the Zuri mark.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.2 10 3.5l6.5 4.7V16a.5.5 0 0 1-.5.5h-3.5v-4.2h-5v4.2H4a.5.5 0 0 1-.5-.5Z" />
  </Icon>
);

export const WeekIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.2 6.5h11.6M6.8 3.6v2M13.2 3.6v2" />
    <rect x="3.2" y="4.6" width="13.6" height="11.8" rx="2.2" />
    <path d="M7 10.2h2M7 13h5.5" />
  </Icon>
);

export const CaptureIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.2v11.6M4.2 10h11.6" />
    <circle cx="10" cy="10" r="7" />
  </Icon>
);

export const OpportunitiesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 13.5 8 8.6l3 3 4.5-5.4" />
    <path d="M12.4 6.2h3.4v3.3" />
  </Icon>
);

export const ContentIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="3.2" width="12" height="13.6" rx="2.2" />
    <path d="M7 7h6M7 10h6M7 13h3.5" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.2" />
    <path d="m13 13 3.4 3.4" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.2" y="4.6" width="13.6" height="12" rx="2.2" />
    <path d="M3.2 8.4h13.6M7 3.2v2.6M13 3.2v2.6" />
  </Icon>
);

export const AnalyticsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16.2V11M8.7 16.2V5.4M13.3 16.2V8.6M17 16.2h-14" />
  </Icon>
);

export const BrandsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.2 16.4 6.7v6.6L10 16.8 3.6 13.3V6.7Z" />
    <path d="M10 10.2 16.4 6.7M10 10.2 3.6 6.7M10 10.2v6.6" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M10 2.8v1.8M10 15.4v1.8M17.2 10h-1.8M4.6 10H2.8M15.1 4.9l-1.3 1.3M6.2 13.8l-1.3 1.3M15.1 15.1l-1.3-1.3M6.2 6.2 4.9 4.9" />
  </Icon>
);
