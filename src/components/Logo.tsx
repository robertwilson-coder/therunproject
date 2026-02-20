import { memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
}

const sizeClasses = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-20',
};

export const Logo = memo(({ className = '', size = 'md', onClick }: LogoProps) => {
  const { isDarkMode } = useTheme();

  const logoSrc = isDarkMode
    ? "/TheRunProject copy copy.svg"
    : "/TheRunProjectdblue.svg";

  return (
    <img
      src={logoSrc}
      alt="The Run Project"
      className={`${sizeClasses[size]} ${className} w-auto`}
      onClick={onClick}
      loading="eager"
    />
  );
});

Logo.displayName = 'Logo';
