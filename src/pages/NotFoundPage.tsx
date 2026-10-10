import { Link } from 'react-router-dom';
import { usePageTitle } from '../app/pageTitle';
import { StateView } from '../components/StateView';

export function NotFoundPage() {
  usePageTitle('Not found');
  return (
    <StateView
      label="404"
      title="Nothing at this address"
      actions={
        <>
          <Link className="plain-action primary" to="/now-playing">
            Now playing
          </Link>
          <Link className="plain-action" to="/library">
            Library
          </Link>
        </>
      }
    >
      <p>The link may be outdated. Albums and artists open from their Spotify ID.</p>
    </StateView>
  );
}
