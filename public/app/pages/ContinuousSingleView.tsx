import React, { useEffect } from 'react';
import 'react-dom';

import { useAppDispatch, useAppSelector } from '@pyroscope/redux/hooks';
import {
  fetchSingleView,
} from '@pyroscope/redux/reducers/continuous';
import { Panel } from '@pyroscope/components/Panel';
import { FlameGraphWrapper } from '@pyroscope/components/FlameGraphWrapper';
import styles from './ContinuousSingleView.module.css';

/* NodeSource changes:
  - removed the timeline, tags and annotations
  - Simplified the component to receive the data directly as a prop
*/

type ContinuousSingleViewProps = {
  extraButton?: React.ReactNode;
  extraPanel?: React.ReactNode;
  data: any;
};

function ContinuousSingleView({
  extraButton,
  extraPanel,
  data
}: ContinuousSingleViewProps) {
  const dispatch = useAppDispatch();

  const { singleView } = useAppSelector((state) => state.continuous);

  useEffect(() => {
    dispatch(fetchSingleView(data));
  }, [data, dispatch]);

  return (
    <div>
      <Panel
        isLoading={false}
        headerActions={extraButton}
      >
        {extraPanel ? (
          <div className={styles.flamegraphContainer}>
            <div className={styles.flamegraphComponent}>
              {<FlameGraphWrapper profile={singleView.profile} />}
            </div>
            <div className={styles.extraPanel}>{extraPanel}</div>
          </div>
        ) : (
          <FlameGraphWrapper profile={singleView.profile} />
        )}
      </Panel>
    </div>
  );
}

export default ContinuousSingleView;
