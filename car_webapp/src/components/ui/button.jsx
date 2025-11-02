import React from "react";

const base = "inline-flex items-center justify-center rounded-md font-semibold transition";
const variants = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white",
  ghost: "bg-white/5 hover:bg-white/10 text-gray-100",
  danger: "bg-red-600 hover:bg-red-700 text-white",
};
const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export const Button = React.forwardRef(function Button(
  { children, className = "", variant = "primary", size = "md", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;