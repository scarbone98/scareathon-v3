export const navItems = [
  {
    name: "Home",
    path: "/",
    color: "red",
  },
  {
    name: "Arcade",
    path: "/arcade",
    color: "green",
  },
  {
    name: "Scareathon",
    path: "/scareathon",
    color: "#F0E68C",
  },
  {
    name: "News",
    path: "/announcements",
    color: "#dd8108",
  },
];

export const profileNavItem = {
  name: "Profile",
  path: "/profile",
  color: "#8A2BE2",
};

export const mobileNavItems = [
  ...navItems,
  {
    ...profileNavItem,
    group: "account",
  },
];
