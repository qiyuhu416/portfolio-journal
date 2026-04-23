import { createContext, useContext, useState, type ReactNode } from 'react';

type DrawerCtx = {
  openSlug: string | null;
  open: (slug: string) => void;
  close: () => void;
};

const Ctx = createContext<DrawerCtx>({
  openSlug: null,
  open: () => {},
  close: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  return (
    <Ctx.Provider
      value={{
        openSlug,
        open: (slug) => setOpenSlug(slug),
        close: () => setOpenSlug(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDrawer() {
  return useContext(Ctx);
}
