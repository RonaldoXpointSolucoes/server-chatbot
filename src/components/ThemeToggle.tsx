import { Sun, Moon } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { cn } from '../lib/utils';

export default function ThemeToggle({ className, size = 18 }: { className?: string; size?: number }) {
  const { theme, setTheme } = useChatStore();

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className={cn(
        "p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-slate-700 dark:text-slate-300",
        className
      )}
      title="Alternar Tema"
    >
      {theme === 'light' ? <Moon size={size} /> : <Sun size={size} />}
    </button>
  );
}
