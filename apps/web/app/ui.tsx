import type { ComponentPropsWithoutRef, ReactNode } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary";
};

export function Button({
  className = "",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant} ${className}`.trim()}
      type="button"
      {...props}
    />
  );
}

type CardProps = ComponentPropsWithoutRef<"article"> & {
  as?: "article" | "aside";
};

export function Card({ as = "article", className = "", ...props }: CardProps) {
  const Component = as;
  return <Component className={`card ${className}`.trim()} {...props} />;
}

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: "default" | "muted" | "success";
};

export function Badge({
  className = "",
  variant = "default",
  ...props
}: BadgeProps) {
  const variantClass = variant === "default" ? "" : `badge-${variant}`;
  return (
    <span className={`badge ${variantClass} ${className}`.trim()} {...props} />
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return <span className="card-label">{children}</span>;
}

type InputProps = ComponentPropsWithoutRef<"input"> & { label: string };

export function Input({ label, ...props }: InputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

type TextareaProps = ComponentPropsWithoutRef<"textarea"> & { label: string };

export function Textarea({ label, ...props }: TextareaProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea {...props} />
    </label>
  );
}
