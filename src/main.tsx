import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { App } from './App';
import './index.css';

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

// Linux compositors can stutter on heavy backdrop blurs (software or weak
// GPUs), so the CSS layer disables them when this class is present.
if (navigator.userAgent.includes('Linux')) {
  document.documentElement.classList.add('platform-linux');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />,
);
