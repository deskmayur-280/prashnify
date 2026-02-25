// frontend/src/components/ui/avatar/DicebearAvatar.jsx
import React, { useState } from "react";
import { getAvatarUrl } from "@/utils/avatar";

/**
 * DiceBear Avatar Component
 * Simple, lightweight avatar display using DiceBear API
 */
const DicebearAvatar = ({
  seed,
  size = "md",
  className = "",
  alt = "Avatar",
  showFallback = true,
}) => {
  const [imageError, setImageError] = useState(false);

  // Size mapping (Tailwind-compatible)
  const sizeClasses = {
    xs: "w-8 h-8",
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32",
    "2xl": "w-40 h-40",
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const avatarUrl = getAvatarUrl(seed);

  const handleError = () => {
    setImageError(true);
  };

  const handleLoad = () => {
    setImageError(false);
  };

  // Fallback display
  if (imageError && showFallback) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold ${className}`}
        title={alt}
      >
        {seed ? seed.charAt(0).toUpperCase() : "?"}
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={alt}
      className={`${sizeClass} rounded-full object-cover ${className}`}
      onError={handleError}
      onLoad={handleLoad}
      loading="lazy"
    />
  );
};

export default DicebearAvatar;
