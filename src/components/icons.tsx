import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { children?: ReactNode };

const Icon = ({ children, className, ...props }: IconProps) => (
  <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
    {children}
  </svg>
);

export const MusicIcon = () => <Icon><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></Icon>;
export const ArtistIcon = () => <Icon><circle cx="12" cy="8" r="3.2"/><path d="M5 21c.5-4.2 2.8-6.3 7-6.3s6.5 2.1 7 6.3"/></Icon>;
export const AlbumIcon = () => <Icon><rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="3.5"/></Icon>;
export const ArchiveIcon = () => <Icon><path d="M5 4h11l3 3v13H5z"/><path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4"/></Icon>;
export const LibraryIcon = () => <Icon><path d="M5 4v16M9.5 4v16M14 5.2l4.6 14.4"/></Icon>;
export const SearchIcon = () => <Icon><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></Icon>;
export const QueueIcon = () => <Icon><path d="M4 6h16M4 11h16M4 16h9M17 14.5v5l3.5-2.5z"/></Icon>;
export const SettingsIcon = () => <Icon><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.5h-4L10.4 6a8 8 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.5.9l.3 2.5h4l.3-2.5a8 8 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></Icon>;
export const PreviousIcon = () => <Icon><path d="M6 5v14M18 6l-8 6 8 6z"/></Icon>;
export const NextIcon = () => <Icon><path d="M18 5v14M6 6l8 6-8 6z"/></Icon>;
export const PlayIcon = ({ paused }: { paused: boolean }) =>
  paused ? <Icon><path d="m9 6 9 6-9 6z"/></Icon> : <Icon><path d="M9 7h2.8v10H9zM14.2 7H17v10h-2.8z"/></Icon>;
export const ShuffleIcon = () => <Icon><path d="M4 7h3.2l8.6 10H20M4 17h3.2l8.6-10H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/></Icon>;
export const HeartIcon = ({ filled }: { filled: boolean }) => (
  <Icon className={filled ? 'icon-filled' : undefined}>
    <path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z"/>
  </Icon>
);
export const DeviceIcon = () => <Icon><rect x="3.5" y="5" width="17" height="11"/><path d="M9 20h6M12 16v4"/></Icon>;
export const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <Icon>
    <path d="M4 9.5h3.4L12 6v12l-4.6-3.5H4z"/>
    {muted ? <path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/> : <path d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8"/>}
  </Icon>
);
export const BackIcon = () => <Icon><path d="m15 5-7 7 7 7"/></Icon>;
export const ChevronDownIcon = () => <Icon><path d="m6 9 6 6 6-6"/></Icon>;
export const ExpandIcon = () => <Icon><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></Icon>;
export const MoreIcon = () => <Icon><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.6"/></Icon>;
