import React from "react";

export const Input = React.forwardRef(function Input(
  { className = "", size = "md", ...props },
  ref
) {
  const sizes = {
    sm: "px-2 py-1 text-sm",
    md: "px-3 py-2 text-base",
    lg: "px-4 py-3 text-base",
  };
  return (
    <input
      ref={ref}
      className={`block w-full rounded-md bg-transparent border border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 outline-none ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

export default Input;