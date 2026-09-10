import {
  ActionsIcon,
  AdsIcon,
  AnalyticsIcon,
  BrandsIcon,
  CalendarIcon,
  CaptureIcon,
  ContentIcon,
  OpportunitiesIcon,
  OverviewIcon,
  SearchIcon,
  SettingsIcon,
  WeekIcon,
} from "@/components/nav-icons";
import type { ComponentType, SVGProps } from "react";

export type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  enabled: boolean;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

/**
 * Navigation is unchanged from Run 1 — same items, same order. Only the
 * presentation is new: a hairline splits the workspace surfaces from the
 * foundation ones.
 */
export const navigation: NavGroup[] = [
  {
    items: [
      { label: "Overview", href: "/dashboard", icon: OverviewIcon, enabled: true },
      { label: "Growth Week", href: "/dashboard/growth-week", icon: WeekIcon, enabled: true },
      { label: "Capture", href: "/dashboard/capture", icon: CaptureIcon, enabled: true },
      { label: "Opportunities", href: "/dashboard/opportunities", icon: OpportunitiesIcon, enabled: true },
      { label: "Actions", href: "/dashboard/actions", icon: ActionsIcon, enabled: true },
      { label: "Content", href: "/dashboard/content", icon: ContentIcon, enabled: true },
      { label: "Search", href: "/dashboard/search", icon: SearchIcon, enabled: true },
      { label: "Ads", href: "/dashboard/ads", icon: AdsIcon, enabled: true },
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon, enabled: true },
      { label: "Analytics", icon: AnalyticsIcon, enabled: false },
    ],
  },
  {
    label: "Foundation",
    items: [
      { label: "Brands", href: "/dashboard/brands", icon: BrandsIcon, enabled: true },
      { label: "Settings", icon: SettingsIcon, enabled: false },
    ],
  },
];
