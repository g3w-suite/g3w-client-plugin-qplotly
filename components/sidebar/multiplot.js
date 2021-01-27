import {charts} from '../../config/app';
const template = require('./multiplot.html');

export default function MultiPlot({service}={}){
  return  {
    name: "qplotly",
    data(){
      return {
        plots: [],
      };
    },
    template,
    computed: {
      loading(){
        return service.state.chartsloading;
      }
    },
    methods:{
      addRemovePlot(plot){
        setTimeout(()=>{
          service[plot.show && 'showPlot' || 'hidePlot'](plot);
        })
      }
    },
    created() {
      this.plots = service.getPlots();
    }
  }
};
