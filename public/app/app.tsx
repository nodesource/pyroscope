import React, { useEffect } from 'react';
import '@pyroscope/jquery-import';
import { SingleView } from '@pyroscope/pages/SingleView';
import store from '@pyroscope/redux/store';
import '@szhsin/react-menu/dist/index.css';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import './sass/profile.scss';

declare global {
  interface Window {
    __grafana_public_path__: string;
  }
}

if (typeof window !== 'undefined') {
  // Icons from @grafana/ui are not bundled, this forces them to be loaded via a CDN instead.
  window.__grafana_public_path__ = 'assets/grafana/';
}

/* NodeSource changes:
  - removed the routes logic
  - add data as a prop
  - select the child-app-container node to render the app, we had to contain the app with is own store to avoid state conflicts with the parent app
*/

export function App({ data }: { data: any }) {
  return (
    <Provider store={store}>
      <SingleView data={data}/>
    </Provider>
  );
}

export const IsolatedApp = ({ data }: { data: any })  => {

  useEffect(() => {
    const mountNode = document.getElementById('child-app-container');
    if (mountNode) {
      const root = ReactDOM.createRoot(mountNode);
      root.render(
        <Provider store={store}>
          <App data={data}/>
        </Provider>
      );
    } else {
      console.error('Target container is not a DOM element.');
    }
  }, [data]);

  return null;
};
