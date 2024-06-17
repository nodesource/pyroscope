import React from 'react';
import ContinuousSingleView from '@pyroscope/pages/ContinuousSingleView';

export function SingleView({ data }) {
  console.log('single view', data);
  return <ContinuousSingleView data={data}/>;
  // return <div>this is a test</div>;
}
