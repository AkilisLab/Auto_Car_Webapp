import React from "react";

export const Slider = React.forwardRef(function Slider({ value, min = 0, max = 100, step = 1, className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      className={`w-full h-2 rounded-lg appearance-none bg-gray-700/40 ${className}`}
      {...props}
    />
  );
});

export default Slider;