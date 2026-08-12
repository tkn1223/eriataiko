import { AppShell } from '@/ui/app-shell';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <AppShell>{children}</AppShell>;
}
