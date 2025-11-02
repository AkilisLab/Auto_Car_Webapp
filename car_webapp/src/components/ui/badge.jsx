import React from "react";

export const Badge = React.forwardRef(function Badge(
  { children, className = "", variant = "muted", size = "sm", ...props },
  ref
) {
  const variants = {
    muted: "bg-gray-800 text-gray-200",
    success: "bg-green-600 text-white",
    danger: "bg-red-600 text-white",
    info: "bg-blue-600 text-white",
  };
  const sizes = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };
  return (
    <span
      ref={ref}
      className={`inline-block rounded font-semibold ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
});

export default Badge;