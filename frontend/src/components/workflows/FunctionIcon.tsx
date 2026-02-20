import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

type FunctionIconProps = {
    icon?: ReactNode | IconType;
    className?: string; // Allow passing className
};

function FunctionIcon({ icon, className }: FunctionIconProps) {
    if (icon) {
        // Check if it's a component (function) or an element (object)
        if (typeof icon === 'function') {
            const Icon = icon as IconType;
            return <div className={className}><Icon /></div>;
        }
        return <div className={className}>{icon as ReactNode}</div>;
    }
    return (
        <svg width="14" viewBox="0 0 75 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="3" width="71" height="94" rx="10" fill="#F9F9F9" />
            <path
                d="M22 50H52"
                stroke="rgb(17, 17, 17)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
            <path
                d="M17 77H23.9528C26.2429 76.9949 30.242 75.9738 32 74.5C33.758 73.0262 35.164 71.1925 35.5778 68.9307L39.4222 31.0693C39.836 28.8075 41.242 26.9738 43 25.5C44.758 24.0262 47.7571 23.0051 50.0472 23H57"
                stroke="rgb(17, 17, 17)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
}

export default FunctionIcon;
