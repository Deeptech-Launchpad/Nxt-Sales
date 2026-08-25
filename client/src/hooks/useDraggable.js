import { useState, useRef, useEffect } from 'react'

export function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (!dragRef.current) return
      isDraggingRef.current = true
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: pos.x,
        posY: pos.y,
      }
      e.preventDefault()
    }

    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y
      setPos({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      })
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }

    const headerEl = dragRef.current?.querySelector?.('.act-popup-header')
    if (headerEl) {
      headerEl.addEventListener('mousedown', handleMouseDown)
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        headerEl.removeEventListener('mousedown', handleMouseDown)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [pos])

  return { dragRef, pos }
}
