module.exports = {
  name: 'filtersinfo',
  props:{
    title: {
      type: String,
      default: ""
    },
    filters: {
      type: Array,
      default: []
    }
  },
  render(h){
    return h('div', {
        style: {
          width: '100%'
        }
      },
      [
        h('div', {
          style:{
            textAlign: 'center',
            color: "#FFFFFF",
            width: '100%',
            fontWeight: 'bold',
            padding: '2px',
            minHeight: '20px'
          },
          class:{
            'skin-background-color': true
          }
        }, this.title),

        h('ul', {
          style: {
            backgroundColor: "#FFFFFF",
            padding: '8px 0 0 20px',
            fontWeight: 'bold'
          },
          class: {
            'skin-color': true
          }
        },
        this.filters.map(filter => h('li', {
          directives: [
            {
              name: 't-plugin',
              value: `qplotly.filters.${filter}`
            }
          ]
        }))
      )
   ])
  }
};