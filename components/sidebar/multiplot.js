import {charts} from '../../config/app';
const template = require('./multiplot.html');

export default function MultiPlot({service}={}){
  return  {
    name: "qplotly",
    data(){
      return {
        plots: []
      };
    },
    template,
    computed: {
      disabled(){
        return service.state.loading;
      },
      notsubplots(){
        return this.plots.filter(plot => charts.no_subplots.indexOf(plot.plot.type) !== -1);
      },
      subplots(){
        return this.plots.filter(plot => charts.no_subplots.indexOf(plot.plot.type) === -1);
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
