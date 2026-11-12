import * as ToastPrimitive from "@radix-ui/react-toast";

// export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = () => (
  <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[100vw] flex-col gap-2 outline-none" />
);

type ToastProps = Omit<ToastPrimitive.ToastProps, "title" | "content"> & {
  title?: string;
  content: string;
  children?: React.ReactNode;
  altText?: string;
};

export const Toast = ({
  title,
  content,
  children,
  altText = "Toast action",
  ...props
}: ToastProps) => {
  return (
    <ToastPrimitive.Root
      className="flex items-start justify-between gap-4 rounded-xl border border-line bg-white p-4 shadow-lg"
      {...props}
    >
      <div className="space-y-1">
        {title && (
          <ToastPrimitive.Title className="text-sm font-semibold text-ink">
            {title}
          </ToastPrimitive.Title>
        )}
        <ToastPrimitive.Description className="text-sm text-muted">
          {content}
        </ToastPrimitive.Description>
      </div>
      <div className="flex items-center gap-2">
        {children && (
          <ToastPrimitive.Action altText={altText} asChild>
            {children}
          </ToastPrimitive.Action>
        )}
        <ToastPrimitive.Close
          aria-label="Close"
          className="rounded p-1 text-muted hover:text-ink"
        >
          <span aria-hidden>×</span>
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  );
};
