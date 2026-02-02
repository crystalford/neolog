
interface LogoProps {
    className?: string
    size?: "default" | "lg" | "xl"
    showText?: boolean
    theme?: "light" | "dark"
}

export function Logo({ className = "", size = "default", showText = true }: LogoProps) {
    const sizeClasses = {
        default: "h-8 text-xl",
        lg: "h-10 text-2xl",
        xl: "h-12 text-3xl"
    }

    const iconSizes = {
        default: 32,
        lg: 40,
        xl: 48
    }

    return (
        <div className={`flex items-center gap-2.5 font-display font-bold tracking-tight text-[var(--text-primary)] ${sizeClasses[size]} ${className}`}>
            <div className="relative flex items-center justify-center">
                <svg
                    width={iconSizes[size]}
                    height={iconSizes[size]}
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Modern geometric N shape */}
                    <path
                        d="M6 4C6 2.89543 6.89543 2 8 2H10C11.1046 2 12 2.89543 12 4V28C12 29.1046 11.1046 30 10 30H8C6.89543 30 6 29.1046 6 28V4Z"
                        fill="url(#accent-gradient)"
                    />
                    
                    <path
                        d="M20 4C20 2.89543 20.8954 2 22 2H24C25.1046 2 26 2.89543 26 4V28C26 29.1046 25.1046 30 24 30H22C20.8954 30 20 29.1046 20 28V4Z"
                        fill="url(#accent-gradient-2)"
                    />
                    
                    <path
                        d="M12 6L20 26H14L7 6H12Z"
                        fill="url(#accent-gradient-3)"
                    />

                    <defs>
                        <linearGradient id="accent-gradient" x1="9" y1="2" x2="9" y2="30" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#3b82f6" />
                            <stop offset="1" stopColor="#2563eb" />
                        </linearGradient>
                        <linearGradient id="accent-gradient-2" x1="23" y1="2" x2="23" y2="30" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#06b6d4" />
                            <stop offset="1" stopColor="#0891b2" />
                        </linearGradient>
                        <linearGradient id="accent-gradient-3" x1="13.5" y1="6" x2="13.5" y2="26" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#a855f7" />
                            <stop offset="1" stopColor="#7c3aed" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            {showText && <span>Neolog</span>}
        </div>
    )
}
