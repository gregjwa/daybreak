import * as React from "react";
import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

type PhosphorIconComponent = React.ComponentType<PhosphorIconProps>;

interface IconProps extends Omit<PhosphorIconProps, "size"> {
  icon: PhosphorIconComponent;
  size?: "xs" | "sm" | "md" | "lg";
}

const sizeMap: Record<NonNullable<IconProps["size"]>, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
};

const Icon = ({ icon: IconComponent, size = "md", className, weight = "regular", ...props }: IconProps) => {
  return (
    <IconComponent
      aria-hidden={props["aria-label"] ? undefined : true}
      size={sizeMap[size]}
      weight={weight}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
};

export { Icon };


