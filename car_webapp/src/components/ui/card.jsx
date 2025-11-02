import React from "react";

export const Card = React.forwardRef(function Card(
  { children, className = "", as: Component = "div", shadow = true, padded = true, bgImage, bgClass = "bg-cover bg-center", overlay = true, ...props },
  ref
) {
  const style = bgImage ? { backgroundImage: `url(${bgImage})` } : undefined;
  return (
    <Component
      ref={ref}
      style={style}
      className={`relative rounded-lg overflow-hidden ${shadow ? "shadow-md shadow-black/40" : ""} ${padded ? "p-4" : ""} bg-gradient-to-br from-[#0b1624]/60 to-[#071021]/60 ${bgImage ? bgClass : ""} ${className}`}
      {...props}
    >
      {bgImage && overlay && <div className="absolute inset-0 bg-black/35 pointer-events-none" />}
      <div className={`${bgImage ? "relative z-10" : ""}`}>{children}</div>
    </Component>
  );
});

export default Card;

export function CardContent({ children, className = "", ...props }) {
  return <div className={className} {...props}>{children}</div>;
}
export function CardHeader({ children, className = "", ...props }) {
  return <div className={className} {...props}>{children}</div>;
}
export function CardTitle({ children, className = "", ...props }) {
  return <h3 className={className} {...props}>{children}</h3>;
}