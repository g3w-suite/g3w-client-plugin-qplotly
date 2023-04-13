<template>
  <ul id="chart_plot_multi_plot" class="treeview-menu" style="padding: 10px;color:#FFFFFF">
    <li
      v-for="plot in plots"
      :key="plot.id">

      <input
        type="checkbox"
        :id="plot.id"
        class="magic-checkbox"
        v-model="plot.show"
        @change="showHidePlot(plot)" >

        <label
          :class="{'g3w-disabled': loading}"
          :for="plot.id"
          style="display:flex; justify-content: space-between; align-items: center">

            <span style="white-space: pre-wrap">{{ plot.label }}</span>
            <span>{{plot.plot.type}}</span>

        </label>
    </li>
  </ul>
</template>

<script>

import PluginService from '../../service';

export default {
  name: "Multiplot",
  data(){
    return {
      plots: PluginService.getPlots(),
    };
  },
  computed: {
    loading(){
      return PluginService.state.chartsloading;
    }
  },

  methods:{
    showHidePlot(plot){
      setTimeout(()=>{
        PluginService[plot.show && 'showPlot' || 'hidePlot'](plot);
      })
    }
  },
}
</script>

<style scoped>

</style>