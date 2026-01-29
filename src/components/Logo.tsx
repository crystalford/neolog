
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
                    {/* Left vertical stroke - The "Accent" */}
                    <path
                        d="M7 4C7 2.89543 7.89543 2 9 2H10C11.1046 2 12 2.89543 12 4V28C12 29.1046 11.1046 30 10 30H9C7.89543 30 7 29.1046 7 28V4Z"
                        fill="url(#accent-gradient)"
                    />

                    {/* Right part - Parallel Structure */}
                    {/* Main vertical right */}
                    <path
                        d="M20 4 C20 2.895 20.895 2 22 2 H23 C24.105 2 25 2.895 25 4 V28 C25 29.105 24.105 30 23 30 H22 C20.895 30 20 29.105 20 28 V4 Z"
                        fill="currentColor"
                    />

                    {/* Connecting Diagonal */}
                    <path
                        d="M12 4L20 28H14L7 4H12Z"
                        fill="currentColor"
                        opacity="0.4"
                    />

                    <defs>
                        <linearGradient id="accent-gradient" x1="6" y1="2" x2="6" y2="30" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#FF4500" />
                            <stop offset="1" stopColor="#FF6500" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            {showText && <span>Neolog</span>}
        </div>
    )
}
