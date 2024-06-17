import { renderSingle, RenderOutput } from '@pyroscope/services/render';
import { RequestAbortedError } from '@pyroscope/services/base';
import { addNotification } from '../notifications';
import { createAsyncThunk } from '../../async-thunk';
import { ContinuousState } from './state';

let singleViewAbortController: AbortController | undefined;

export const fetchSingleView = createAsyncThunk<
  RenderOutput,
  any,
  { state: { continuous: ContinuousState } }
>('continuous/singleView', async (data, thunkAPI) => {
  if (singleViewAbortController) {
    singleViewAbortController.abort();
  }

  singleViewAbortController = new AbortController();
  thunkAPI.signal = singleViewAbortController.signal;

  // const state = thunkAPI.getState();
  console.log('thunk', data);
  const res = await renderSingle(data);
  console.log(res);

  if (res.isOk) {
    return Promise.resolve(res.value);
  }

  if (res.isErr && res.error instanceof RequestAbortedError) {
    return Promise.reject(res.error);
  }

  thunkAPI.dispatch(
    addNotification({
      type: 'danger',
      title: 'Failed to load single view data',
      message: res.error.message,
    })
  );

  return Promise.reject(res.error);
});
