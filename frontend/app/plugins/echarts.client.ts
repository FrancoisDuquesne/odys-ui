import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart, LineChart, ScatterChart, CustomChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import VChart from "vue-echarts";

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  ScatterChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
]);

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("VChart", VChart);
});
