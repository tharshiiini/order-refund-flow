import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

type Props = {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  id,
  ...rest
}: Props) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className={`flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-brand/30 bg-white text-white
        data-[state=checked]:border-brand data-[state=checked]:bg-brand
        data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand
        disabled:cursor-not-allowed disabled:opacity-40
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
      {...rest}
    >
      <CheckboxPrimitive.Indicator>
        {checked === "indeterminate" ? (
          <Minus className="size-3.5" strokeWidth={3} />
        ) : (
          <Check className="size-3.5" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
