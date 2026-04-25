import { Sun, Moon } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export default function ThemeToggle() {
  const { theme, setTheme } = useChatStore();

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-slate-700 dark:text-slate-300"
      title="Alternar Tema"
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}
