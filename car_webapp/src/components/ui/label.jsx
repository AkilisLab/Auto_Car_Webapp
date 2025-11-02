import React from "react";

export function Label({ children, htmlFor, className = "", ...props }) {
  return (
    <label htmlFor={htmlFor} className={`block text-sm font-medium text-gray-300 ${className}`} {...props}>
      {children}
    </label>
  );
}

export default Label;