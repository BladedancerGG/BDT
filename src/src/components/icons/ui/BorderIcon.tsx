import type { SVGProps } from "react";

export default function BorderIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" aria-hidden focusable="false" {...props}>
            <rect x="1" y="1" width="94" height="94" fill="none" stroke="white" strokeWidth="2"/>
        </svg>
    )
}
