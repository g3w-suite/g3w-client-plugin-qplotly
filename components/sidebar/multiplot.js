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
    methods:{
      addRemovePlot(evt, plot){
        evt.target.checked ? service.showPlot(plot) : service.hidePlot(plot);
      }
    },
    created() {
      this.plots = service.getPlots();
    }
  }
};
