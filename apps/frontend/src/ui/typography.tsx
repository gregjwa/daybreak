import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const headingVariants = cva("text-foreground tracking-tight", {
  variants: {
    level: {
      1: "text-3xl font-semibold",
      2: "text-2xl font-semibold",
      3: "text-lg font-semibold",
      4: "text-base font-semibold",
    },
  },
  defaultVariants: {
    level: 2,
  },
});

interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  as?: "h1" | "h2" | "h3" | "h4";
}

const Heading = ({ as: Comp = "h2", level = 2, className, ...props }: HeadingProps) => {
  return <Comp className={cn(headingVariants({ level, className }))} {...props} />;
};

const textVariants = cva("text-foreground", {
  variants: {
    variant: {
      body: "text-sm leading-relaxed",
      ui: "text-sm leading-snug",
      muted: "text-sm text-muted-foreground",
      caption: "text-xs text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

interface TextProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof textVariants> {
  as?: "p" | "span" | "div";
}

const Text = ({ as: Comp = "p", variant = "body", className, ...props }: TextProps) => {
  return <Comp className={cn(textVariants({ variant, className }))} {...props} />;
};

export { Heading, Text };


