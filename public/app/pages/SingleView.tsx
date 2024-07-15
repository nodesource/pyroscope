import React from 'react';
import ContinuousSingleView from '@pyroscope/pages/ContinuousSingleView';

/* NodeSource changes:
  - modified function to receive the data directly as a prop
*/
interface SingleViewProps {
  data: any;
}

export function SingleView({ data }: SingleViewProps) {
  return <ContinuousSingleView data={data}/>;
}
