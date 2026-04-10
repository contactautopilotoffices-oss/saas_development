/**
 * ContextBar
 * Sticky breadcrumb / path bar showing current location hierarchy.
 * @remarks Client component.
 */

'use client';

import { useGlobalContext } from "@/frontend/context/GlobalContext";
import { ChevronRight, Home, Building2, Layers } from "lucide-react";
import { cn } from "@/backend/lib/utils";
import { UniversalSearch } from "@/frontend/components/shared";

export function ContextBar() {
    const { context, navigateUp, selectProperty, selectBuilding } = useGlobalContext();

    // Helper to render a breadcrumb item
    const BreadcrumbItem = ({
        icon: Icon,
        label,
        isActive,
        onClick
    }: {
        icon: any;
        label: string;
        isActive: boolean;
        onClick?: () => void;
    }) => (
        <div className={cn("flex items-center group shrink-0", onClick && "cursor-pointer")} onClick={onClick}>
            <Icon className={cn("h-4 w-4 mr-1.5 md:mr-2 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            <span className={cn(
                "text-xs font-medium uppercase tracking-wider truncate max-w-[100px] md:max-w-none",
                isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
            )}>
                {label}
            </span>
        </div>
    );

    const Separator = () => <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1 md:mx-2 shrink-0" />;

    return (
        <div className="w-full h-12 md:h-14 border-b border-border bg-white/50 backdrop-blur-sm flex items-center px-4 md:px-8 z-40 sticky top-0">
            <div className="flex items-center min-w-0 overflow-x-auto hide-scrollbar">
                {/* Organization (Always present) */}
                <BreadcrumbItem
                    icon={Home}
                    label={context.organization?.name || "Loading..."}
                    isActive={!context.property}
                    onClick={() => {
                        if (context.property) navigateUp();
                    }}
                />

                {context.property && (
                    <>
                        <Separator />
                        <BreadcrumbItem
                            icon={Building2}
                            label={context.property.name}
                            isActive={!context.building}
                            onClick={() => {
                                if (context.building) navigateUp();
                            }}
                        />
                    </>
                )}

                {context.building && (
                    <>
                        <Separator />
                        <BreadcrumbItem
                            icon={Layers}
                            label={context.building.name}
                            isActive={!context.floor}
                            onClick={() => {
                                if (context.floor) navigateUp();
                            }}
                        />
                    </>
                )}

                {context.floor && (
                    <>
                        <Separator />
                        <div className="flex items-center shrink-0">
                            <span className="w-2 h-2 rounded-full bg-success mr-2 animate-pulse"></span>
                            <span className="text-sm font-bold text-foreground">
                                {context.floor.name}
                            </span>
                        </div>
                    </>
                )}
            </div>

            <div className="flex-1 flex justify-center max-w-xl mx-4 md:mx-12">
                <UniversalSearch />
            </div>

            <div className="ml-auto flex items-center shrink-0">
                {/* Status Indicator - Hidden on small mobile */}
                <div className="hidden sm:flex items-center space-x-2">
                    <span className="h-2 w-2 rounded-full bg-success"></span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                        <span className="hidden md:inline">System </span>Operational
                    </span>
                </div>
            </div>
        </div>
    );
}

// Add hide-scrollbar utility style
const style = `
.hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
    display: none;
}
`;

// Inject the style if not already present
if (typeof document !== 'undefined') {
    const styleId = 'hide-scrollbar-style';
    if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = style;
        document.head.appendChild(styleEl);
    }
}
