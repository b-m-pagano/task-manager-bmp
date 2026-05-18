import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInbox } from "@/lib/tasks.functions";
import logoFilaFoco from "@/assets/logo-filafoco.png";
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  CalendarRange,
  Inbox,
  ListTodo,
  FolderKanban,
  Tags,
  Settings,
  Focus,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Mês", url: "/app/month", icon: CalendarRange },
  { title: "Semana", url: "/app/week", icon: Calendar },
  { title: "Hoje", url: "/app/today", icon: CalendarDays },
  { title: "Foco", url: "/app/focus", icon: Focus },
  { title: "Inbox", url: "/app/inbox", icon: Inbox },
];

const orgItems = [
  { title: "Tarefas", url: "/app/tasks", icon: ListTodo },
  { title: "Projetos", url: "/app/projects", icon: FolderKanban },
  { title: "Categorias", url: "/app/categories", icon: Tags },
];

const systemItems = [
  { title: "Configurações", url: "/app/settings", icon: Settings },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const listInboxFn = useServerFn(listInbox);
  const { data: inboxCount } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => listInboxFn(),
    select: (rows) => (Array.isArray(rows) ? rows.length : 0),
  });

  const isActive = (url: string, exact?: boolean) =>
    exact ? currentPath === url : currentPath === url || currentPath.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/app" className="flex items-center gap-2 px-2 py-1.5">
          <img
            src={logoFilaFoco}
            alt="BMP Task Manager"
            className="h-7 w-7 shrink-0 rounded-md object-cover"
          />
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            BMP Task Manager
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const isInbox = item.url === "/app/inbox";
                const showBadge = isInbox && (inboxCount ?? 0) > 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span className="flex-1">{item.title}</span>
                        {showBadge && (
                          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground group-data-[collapsible=icon]:hidden">
                            {inboxCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Organização</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {orgItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
