import React, { useEffect } from 'react';
import { Sidebar } from '@pyroscope/components/Sidebar';
// import { TenantWall } from '@pyroscope/components/TenantWall';
import { useSelectFirstApp } from '@pyroscope/hooks/useAppNames';
import '@pyroscope/jquery-import';
// import { ComparisonView } from '@pyroscope/pages/ComparisonView';
// import { DiffView } from '@pyroscope/pages/DiffView';
// import { ExploreView } from '@pyroscope/pages/ExploreView';
import { SingleView } from '@pyroscope/pages/SingleView';
import { ROUTES } from '@pyroscope/pages/routes';
import store from '@pyroscope/redux/store';
// import Notifications from '@pyroscope/ui/Notifications';
import { history } from '@pyroscope/util/history';
import '@szhsin/react-menu/dist/index.css';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { Route, Router, Switch } from 'react-router-dom';
import { setupReduxQuerySync } from './redux/useReduxQuerySync';
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

export function App({ data }) {
  // setupReduxQuerySync();
  // useSelectFirstApp();

  return (
    <Provider store={store}>
      <SingleView data={data}/>
    </Provider>
  );
}

export const IsolatedApp = ({ data }) => {

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
  }, []);

  return null;
};
