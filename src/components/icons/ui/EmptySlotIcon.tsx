import type { SVGProps } from "react";

export default function EmptySlotIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" aria-hidden focusable="false" strokeWidth="3" {...props}>
            {/*Haut gauche*/}
            <line x1="0" x2="27" y1="0.5" y2="0.5"/>
            <line x1="0.5" x2="0.5" y1="0" y2="27"/>

            {/*Haut droite*/}
            <line x1="69" x2="96" y1="0.5" y2="0.5"/>
            <line x1="95.5" x2="95.5" y1="0" y2="27"/>

            {/*Bas gauche*/}
            <line x1="0" x2="27" y1="95.5" y2="95.5"/>
            <line x1="0.5" x2="0.5" y1="69" y2="96"/>

            {/*Bas droite*/}
            <line x1="69" x2="96" y1="95.5" y2="95.5"/>
            <line x1="95.5" x2="95.5" y1="69" y2="96"/>
        </svg>
    )
}