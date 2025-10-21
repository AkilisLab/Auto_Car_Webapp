import React from "react";
export function Label({ children, className = "", ...props }) {
  return <label className={`font-medium ${className}`} {...props}>{children}</label>;
}