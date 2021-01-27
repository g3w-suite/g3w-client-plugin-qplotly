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
            minHeight: '20px',
            fontSize: '1.2em'
          },
          class:{
            'skin-background-color': true
          }
        }, this.title),

        h('ul', {
          style: {
            backgroundColor: "#FFFFFF",
            paddingLeft: '3px',
            fontWeight: 'bold',
            'list-style-type': 'none'
          },
          class: {
            'skin-color': true
          }
        },
        this.filters.map(filter => h('li', {
          style: {
            paddingBottom: '5px'
          },
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