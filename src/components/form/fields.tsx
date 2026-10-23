"use client";

import { useId } from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Radix Select cannot use "" as a value; this sentinel represents "no selection". */
export const NONE = "__none";

// Forms parse input into a different output type (zod transforms), so the
// control's context and transformed-value types are left open here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyControl<T extends FieldValues> = Control<T, any, any>;

type Base<T extends FieldValues> = {
  control: AnyControl<T>;
  name: Path<T>;
  label: string;
  description?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
};

function FieldShell({
  id,
  label,
  description,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {description && !error && (
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  required,
  disabled,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  step,
  min,
  max,
  prefix,
}: Base<T> & {
  type?: "text" | "email" | "tel" | "date" | "number" | "time" | "password" | "datetime-local" | "url" | "color";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  step?: string;
  min?: string;
  max?: string;
  prefix?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell id={id} label={label} description={description} error={fieldState.error?.message} required={required} className={className}>
          <div className="relative">
            {prefix && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
            <Input
              id={id}
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              inputMode={inputMode}
              step={step}
              min={min}
              max={max}
              disabled={disabled}
              aria-invalid={!!fieldState.error}
              aria-describedby={fieldState.error ? `${id}-error` : description ? `${id}-desc` : undefined}
              className={cn("h-9", prefix && "pl-7")}
              {...field}
              value={field.value ?? ""}
            />
          </div>
        </FieldShell>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  required,
  disabled,
  rows = 4,
  placeholder,
}: Base<T> & { rows?: number; placeholder?: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell id={id} label={label} description={description} error={fieldState.error?.message} required={required} className={className}>
          <Textarea
            id={id}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={!!fieldState.error}
            aria-describedby={fieldState.error ? `${id}-error` : description ? `${id}-desc` : undefined}
            {...field}
            value={field.value ?? ""}
          />
        </FieldShell>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  required,
  disabled,
  options,
  placeholder = "Select…",
  allowNone,
  noneLabel = "None",
}: Base<T> & {
  options: { value: string; label: string }[];
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell id={id} label={label} description={description} error={fieldState.error?.message} required={required} className={className}>
          <Select
            value={field.value ? String(field.value) : allowNone ? NONE : ""}
            onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
            disabled={disabled}
          >
            <SelectTrigger id={id} className="h-9 w-full" aria-invalid={!!fieldState.error} onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({ control, name, label, description, className, disabled }: Base<T>) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className={cn("flex items-start gap-2", className)}>
          <Checkbox id={id} checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={disabled} className="mt-0.5" />
          <div className="grid gap-0.5">
            <Label htmlFor={id} className="font-normal">
              {label}
            </Label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({ control, name, label, description, className, disabled }: Base<T>) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className={cn("flex items-center justify-between gap-4", className)}>
          <div className="grid gap-0.5">
            <Label htmlFor={id}>{label}</Label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
        </div>
      )}
    />
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  variant,
  size,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size ?? "lg"}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
