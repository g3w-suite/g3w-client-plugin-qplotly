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
      pieplots(){
        return this.plots.filter(plot => plot.plot.type === 'pie');
      },
      subplots(){
        return this.plots.filter(plot => plot.plot.type !== 'pie');
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
