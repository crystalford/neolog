
interface LogoProps {
    className?: string
    size?: "default" | "lg" | "xl"
    showText?: boolean
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
        <div className={`flex items-center gap-2.5 font-bold tracking-tighter text-[var(--text-primary)] ${sizeClasses[size]} ${className}`} style={{ fontFamily: 'var(--font-sans)' }}>
            <div className="relative flex items-center justify-center">
                <svg
                    width={iconSizes[size]}
                    height={iconSizes[size]}
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                >
                    {/* Neural Node Mark */}
                    <circle cx="16" cy="16" r="3" fill="currentColor" />
                    <circle cx="16" cy="6" r="2" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="16" cy="26" r="2" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="6" cy="11" r="2" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="26" cy="11" r="2" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="6" cy="21" r="2" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="26" cy="21" r="2" fill="currentColor" fillOpacity="0.4" />
                    
                    {/* Connections */}
                    <path d="M16 9V13" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                    <path d="M16 19V23" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                    <path d="M8 12L13.5 14.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                    <path d="M24 12L18.5 14.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                    <path d="M8 20L13.5 17.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                    <path d="M24 20L18.5 17.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                </svg>
            </div>
            {showText && <span className="uppercase italic">Neolog</span>}
        </div>
    )
}
